import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { createLocalDbConnectedTo, skdbDevServerDb } from "skdb-dev";
import { SKDBDevConsoleProvider } from "skdb-react";

async function init() {
  const remoteDb = await skdbDevServerDb("example");

  await remoteDb.schema(
    "CREATE TABLE example (id TEXT PRIMARY KEY, intCol INTEGER NOT NULL, floatCol FLOAT NOT NULL, skdb_access TEXT NOT NULL);",
  );

  const connect = async (accessKey: string = "root") => {
    const localDb = await createLocalDbConnectedTo(remoteDb, accessKey);

    await localDb.mirror({
      table: "example",
      expectedColumns:
        "(id TEXT PRIMARY KEY, intCol INTEGER NOT NULL, floatCol FLOAT NOT NULL, skdb_access TEXT NOT NULL)",
    });

    return localDb;
  };

  return connect;
}

// init().then((connect) => {
//   connect().then((skdb) => {
//   });
// }).catch((_reason) => {
//     ReactDOM.createRoot(document.getElementById('root')!).render(
//       <React.StrictMode>
//         <h1>Could not connect to the SKDB dev server.<br/>Is it running?</h1>
//       </React.StrictMode>,
//     );
//   });

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
