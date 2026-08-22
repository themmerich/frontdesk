package de.prime_ux.backend;

import static org.assertj.core.api.Assertions.assertThat;

import de.prime_ux.backend.users.AppUserRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;

@SpringBootTest
@Import(TestcontainersConfiguration.class)
class BackendApplicationTests {

	@Autowired
	private AppUserRepository appUserRepository;

	@Test
	void contextLoads() {
	}

	@Test
	void theDefaultConfigurationDoesNotSeedDemoUsers() {
		// This context runs on application.properties alone — exactly what a
		// packaged jar sees. Demo credentials must never exist in production,
		// so the seeder has to stay off without the dev profile.
		assertThat(appUserRepository.count()).isZero();
	}
}
