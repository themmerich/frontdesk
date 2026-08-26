plugins {
	java
	id("org.springframework.boot") version "4.1.0"
	id("io.spring.dependency-management") version "1.1.7"
}

group = "de.prime-ux"
version = "0.0.1-SNAPSHOT"

java {
	toolchain {
		languageVersion = JavaLanguageVersion.of(25)
	}
}

repositories {
	mavenCentral()
}

// Spring AI 2.0 is the line built against Spring Boot 4; the BOM pins every
// spring-ai-* module to one version.
extra["springAiVersion"] = "2.0.1"

dependencyManagement {
	imports {
		mavenBom("org.springframework.ai:spring-ai-bom:${property("springAiVersion")}")
	}
}

dependencies {
	implementation("org.springframework.boot:spring-boot-starter-data-jpa")
	implementation("org.springframework.boot:spring-boot-starter-flyway")
	implementation("org.springframework.boot:spring-boot-starter-mail")
	implementation("org.springframework.boot:spring-boot-starter-security")
	implementation("org.springframework.boot:spring-boot-starter-validation")
	implementation("org.springframework.boot:spring-boot-starter-webmvc")
	implementation("org.springframework.boot:spring-boot-starter-session-jdbc")
	implementation("org.springframework.ai:spring-ai-starter-model-anthropic")
	implementation("org.flywaydb:flyway-database-postgresql")
	compileOnly("org.projectlombok:lombok")
	developmentOnly("org.springframework.boot:spring-boot-devtools")
	developmentOnly("org.springframework.boot:spring-boot-docker-compose")
	runtimeOnly("org.postgresql:postgresql")
	annotationProcessor("org.projectlombok:lombok")
	testImplementation("org.springframework.boot:spring-boot-starter-data-jpa-test")
	testImplementation("org.springframework.boot:spring-boot-starter-flyway-test")
	testImplementation("org.springframework.boot:spring-boot-starter-security-test")
	testImplementation("org.springframework.boot:spring-boot-starter-validation-test")
	testImplementation("org.springframework.boot:spring-boot-starter-webmvc-test")
	testImplementation("com.icegreen:greenmail-junit5:2.1.6")
	testImplementation("org.springframework.boot:spring-boot-testcontainers")
	testImplementation("org.testcontainers:testcontainers-junit-jupiter")
	testImplementation("org.testcontainers:testcontainers-postgresql")
	testCompileOnly("org.projectlombok:lombok")
	testRuntimeOnly("org.junit.platform:junit-platform-launcher")
	testAnnotationProcessor("org.projectlombok:lombok")
}

tasks.withType<Test> {
	useJUnitPlatform()
	// Stored secrets are encrypted, so a test context needs key material like any
	// deployment. Values only have to be well-formed; nothing here outlives the run.
	systemProperty("frontdesk.crypto.secret", "test-only-not-a-real-secret")
	systemProperty("frontdesk.crypto.salt", "0123456789abcdef")
}

// bootRun is the dev run mode; the dev profile unlocks dev-only behavior such
// as the demo-data seeder (application-dev.properties). A packaged jar never
// activates it. The local profile carries the developer's own secrets
// (application-local.properties, git-ignored) and is simply absent when nobody
// created that file.
tasks.bootRun {
	args("--spring.profiles.active=dev,local")
}
