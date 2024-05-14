/*
 * This file was generated by the Gradle 'init' task.
 *
 * This generated file contains a sample Kotlin library project to get you started.
 * For more details take a look at the 'Building Java & JVM projects' chapter in the Gradle
 * User Manual available at https://docs.gradle.org/8.1.1/userguide/building_java_projects.html
 */

plugins {
  id("org.jetbrains.kotlin.jvm")
  id("com.diffplug.spotless") version "6.12.1"

  `java-library`
}

repositories {
  // Use Maven Central for resolving dependencies.
  mavenCentral()
}

dependencies {
  implementation("io.undertow:undertow-core:2.3.2.Final") // http/ws
  implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.7.1")
  implementation("org.java-websocket:Java-WebSocket:1.5.3")

  implementation("com.fasterxml.jackson.core:jackson-databind:2.16.1") // json
}

// Apply a specific Java toolchain to ease working on different environments.
java { toolchain { languageVersion.set(JavaLanguageVersion.of(20)) } }

tasks.named<Test>("test") {
  // Use JUnit Platform for unit tests.
  useJUnitPlatform()
}

spotless { kotlin { ktfmt("0.49") } }
