package de.prime_ux.backend.note;

import static org.assertj.core.api.Assertions.assertThat;

import de.prime_ux.backend.TestcontainersConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase;
import org.springframework.boot.jdbc.test.autoconfigure.AutoConfigureTestDatabase.Replace;
import org.springframework.context.annotation.Import;

// @DataJpaTest normally swaps in an embedded database; keep the real one so the
// Flyway migration runs and queries hit PostgreSQL via Testcontainers.
@DataJpaTest
@AutoConfigureTestDatabase(replace = Replace.NONE)
@Import(TestcontainersConfiguration.class)
class NoteRepositoryTest {

	@Autowired
	private NoteRepository notes;

	@Test
	void persistsAndReadsBackANote() {
		Note saved = notes.save(new Note("First", "Hello world"));

		assertThat(saved.getId()).isNotNull();
		assertThat(saved.getCreatedAt()).isNotNull();
		assertThat(saved.getUpdatedAt()).isNotNull();
		assertThat(notes.findById(saved.getId())).get().extracting(Note::getTitle).isEqualTo("First");
	}
}
