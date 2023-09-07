package io.skiplabs.skdb.server

import io.skiplabs.skdb.Credentials
import io.skiplabs.skdb.DB_ROOT_USER
import io.skiplabs.skdb.ENV
import io.skiplabs.skdb.MuxedSocket
import io.skiplabs.skdb.MuxedSocketEndpoint
import io.skiplabs.skdb.MuxedSocketFactory
import io.skiplabs.skdb.OutputFormat
import io.skiplabs.skdb.ProtoCreateDb
import io.skiplabs.skdb.ProtoCreateUser
import io.skiplabs.skdb.ProtoCredentials
import io.skiplabs.skdb.ProtoData
import io.skiplabs.skdb.ProtoMessage
import io.skiplabs.skdb.ProtoPushPromise
import io.skiplabs.skdb.ProtoQuery
import io.skiplabs.skdb.ProtoRequestTail
import io.skiplabs.skdb.ProtoSchemaQuery
import io.skiplabs.skdb.QueryResponseFormat
import io.skiplabs.skdb.RevealableException
import io.skiplabs.skdb.SchemaScope
import io.skiplabs.skdb.Skdb
import io.skiplabs.skdb.Stream
import io.skiplabs.skdb.WebSocket
import io.skiplabs.skdb.createSkdb
import io.skiplabs.skdb.decodeProtoMsg
import io.skiplabs.skdb.encodeProtoMsg
import io.skiplabs.skdb.openSkdb
import io.undertow.Handlers
import io.undertow.Undertow
import io.undertow.server.HttpHandler
import io.undertow.server.handlers.PathTemplateHandler
import io.undertow.util.PathTemplateMatch
import io.undertow.websockets.spi.WebSocketHttpExchange
import java.io.BufferedOutputStream
import java.io.OutputStream
import java.nio.ByteBuffer
import java.security.SecureRandom
import java.util.concurrent.Executors
import java.util.concurrent.ScheduledExecutorService

fun Credentials.toProtoCredentials(): ProtoCredentials {
  return ProtoCredentials(accessKey, ByteBuffer.wrap(privateKey))
}

fun genAccessKey(): String {
  val csrng = SecureRandom()
  val keyLength = 20
  // build a string of keyLength chars: 0-9a-zA-Z, which is 62 symbols
  val ints = csrng.ints(keyLength.toLong(), 0, 62)
  val codePoints =
      ints
          .map({
            when {
              it < 10 -> it + 48 // offset for 0-9
              it < 10 + 26 -> (it - 10) + 65 // offset for A-Z
              else -> (it - 10 - 26) + 97 // offset for a-z
            }
          })
          .toArray()
  return String(codePoints, 0, keyLength)
}

fun genCredentials(accessKey: String): Credentials {
  val csrng = SecureRandom()

  // generate a 256 bit random key for the root user
  val plaintextRootKey = ByteArray(32)
  csrng.nextBytes(plaintextRootKey)
  val encryptedRootKey = plaintextRootKey
  val creds = Credentials(accessKey, plaintextRootKey, encryptedRootKey)

  return creds
}

fun createDb(dbName: String): Credentials {
  val creds = genCredentials(DB_ROOT_USER)
  createSkdb(dbName, creds.b64encryptedKey())
  return creds
}

sealed interface StreamHandler {

  fun handleMessage(request: ProtoMessage, stream: Stream): StreamHandler
  fun handleMessage(message: ByteBuffer, stream: Stream) =
      handleMessage(decodeProtoMsg(message), stream)

  fun close() {}
}

class ProcessPipe(val proc: Process) : StreamHandler {

  private val stdin: OutputStream

  init {
    val stdin = proc.outputStream
    if (stdin == null) {
      throw RuntimeException("creating a pipe to a process that does not accept input")
    }
    this.stdin = BufferedOutputStream(stdin)
  }

  override fun handleMessage(request: ProtoMessage, stream: Stream): StreamHandler {
    when (request) {
      is ProtoData -> {
        val data = request.data
        stdin.write(data.array(), data.arrayOffset() + data.position(), data.remaining())
        if (request.finFlagSet) {
          stdin.flush()
        }
      }
      else -> {
        close()
        stream.error(2001u, "unexpected request on established connection")
      }
    }

    return this
  }

  override fun close() {
    proc.outputStream?.close()
  }
}

class RequestHandler(
    val skdb: Skdb,
    val accessKey: String,
    val replicationId: String,
) : StreamHandler {

  override fun handleMessage(request: ProtoMessage, stream: Stream): StreamHandler {
    when (request) {
      is ProtoQuery -> {
        if (accessKey != DB_ROOT_USER) {
          stream.error(2002u, "Authorization error")
          return this
        }
        val format =
            when (request.format) {
              QueryResponseFormat.CSV -> OutputFormat.CSV
              QueryResponseFormat.JSON -> OutputFormat.JSON
              QueryResponseFormat.RAW -> OutputFormat.RAW
            }
        val result = skdb.sql(request.query, format)
        if (result.exitSuccessfully()) {
          stream.send(encodeProtoMsg(ProtoData(ByteBuffer.wrap(result.output), finFlagSet = true)))
          stream.close()
        } else {
          stream.error(2000u, result.decode())
        }
      }
      is ProtoSchemaQuery -> {
        val result =
            when (request.scope) {
              SchemaScope.ALL -> skdb.dumpSchema()
              SchemaScope.TABLE -> skdb.dumpTable(request.name!!)
              SchemaScope.VIEW -> skdb.dumpView(request.name!!)
            }
        if (result.exitSuccessfully()) {
          stream.send(encodeProtoMsg(ProtoData(ByteBuffer.wrap(result.output), finFlagSet = true)))
          stream.close()
        } else {
          stream.error(2000u, result.decode())
        }
      }
      is ProtoCreateDb -> {
        stream.error(2003u, "DB creation not supported. Use `--create-db <db>`.")
      }
      is ProtoCreateUser -> {
        if (accessKey != DB_ROOT_USER) {
          stream.error(2002u, "Authorization error")
          return this
        }
        val creds = genCredentials(genAccessKey())
        skdb.createUser(creds.accessKey, creds.b64encryptedKey())
        val payload = creds.toProtoCredentials()
        stream.send(encodeProtoMsg(payload))
        creds.clear()
        stream.close()
      }
      is ProtoRequestTail -> {
        val proc =
            skdb.tail(
                accessKey,
                request.table,
                request.since,
                request.filterExpr,
                replicationId,
                { data, shouldFlush -> stream.send(encodeProtoMsg(ProtoData(data, shouldFlush))) },
                { stream.error(2000u, "Unexpected EOF") },
            )
        return ProcessPipe(proc)
      }
      is ProtoPushPromise -> {
        val proc =
            skdb.writeCsv(
                accessKey,
                request.table,
                replicationId,
                { data, shouldFlush -> stream.send(encodeProtoMsg(ProtoData(data, shouldFlush))) },
                { stream.error(2000u, "Unexpected EOF") })
        return ProcessPipe(proc)
      }
      is ProtoData -> {
        stream.error(2001u, "unexpected data on non-established connection")
      }
      else -> stream.error(2001u, "unexpected message")
    }
    return this
  }
}

fun connectionHandler(
    taskPool: ScheduledExecutorService,
): HttpHandler {
  return Handlers.websocket(
      MuxedSocketEndpoint(
          object : MuxedSocketFactory {
            override fun onConnect(
                exchange: WebSocketHttpExchange,
                channel: WebSocket
            ): MuxedSocket {
              val pathParams =
                  exchange.getAttachment(PathTemplateMatch.ATTACHMENT_KEY).getParameters()
              val db = pathParams["database"]

              if (db == null) {
                throw RuntimeException("database not provided")
              }

              val skdb = openSkdb(db)

              var replicationId: String? = null
              var accessKey: String? = null

              val socket =
                  MuxedSocket(
                      channel = channel,
                      taskPool = taskPool,
                      onStream = { _, stream ->
                        var handler: StreamHandler =
                            RequestHandler(
                                skdb!!,
                                accessKey!!,
                                replicationId!!,
                            )

                        stream.observeLifecycle { state ->
                          when (state) {
                            Stream.State.CLOSED -> handler.close()
                            else -> Unit
                          }
                        }

                        stream.onData = { data ->
                          try {
                            handler = handler.handleMessage(data, stream)
                          } catch (ex: RevealableException) {
                            System.err.println("Exception occurred: ${ex}")
                            stream.error(ex.code, ex.msg)
                          } catch (ex: Exception) {
                            System.err.println("Exception occurred: ${ex}")
                            stream.error(2000u, "Internal error")
                          }
                        }
                        stream.onClose = { stream.close() }
                        stream.onError = { _, _ -> }
                      },
                      onClose = { socket -> socket.closeSocket() },
                      onError = { _, _, _ -> },
                      getDecryptedKey = { authMsg ->
                        accessKey = authMsg.accessKey
                        replicationId =
                            skdb?.replicationId(authMsg.deviceUuid)?.decodeOrThrow()?.trim()
                        val encryptedPrivateKey = skdb?.privateKeyAsStored(authMsg.accessKey)
                        encryptedPrivateKey!!
                      },
                      log = { _, _, _ -> })

              if (skdb == null) {
                socket.errorSocket(1004u, "Could not open database")
              }

              return socket
            }
          }))
}

fun createHttpServer(connectionHandler: HttpHandler): Undertow {
  var pathHandler = PathTemplateHandler().add("/dbs/{database}/connection", connectionHandler)
  return Undertow.builder().addHttpListener(ENV.port, "0.0.0.0").setHandler(pathHandler).build()
}

fun main(args: Array<String>) {
  val arglist = args.toList()

  val createIdx = arglist.indexOf("--create-db")
  if (createIdx >= 0 && arglist.size > createIdx + 1) {
    val db = arglist.get(createIdx + 1)
    val creds = createDb(db)
    println("------------------------------------------------------")
    println("Database `${db}` successfully created.")
    println("Use the following credentials to connect to it.")
    println("access key: ${creds.accessKey}")
    println("private key: ${creds.b64privateKey()}")
    println("------------------------------------------------------")
  }

  val taskPool = Executors.newSingleThreadScheduledExecutor()
  val connHandler = connectionHandler(taskPool)
  val server = createHttpServer(connHandler)
  server.start()
}