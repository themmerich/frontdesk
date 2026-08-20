package de.prime_ux.backend.cases;

import static org.assertj.core.api.Assertions.assertThat;

import de.prime_ux.backend.TestcontainersConfiguration;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.data.jpa.test.autoconfigure.DataJpaTest;
import org.springframework.context.annotation.Import;

@DataJpaTest
@Import(TestcontainersConfiguration.class)
class CaseRepositoryTest {

	@Autowired
	private CaseRepository caseRepository;

	@Test
	void findsCasesNewestFirst() {
		Case older = caseRepository.save(new Case("<older@test>", "a@example.com", "Older", "body",
				Instant.parse("2026-08-01T10:00:00Z"), false, 1024));
		Case newer = caseRepository.save(new Case("<newer@test>", "b@example.com", "Newer", "body",
				Instant.parse("2026-08-02T10:00:00Z"), false, 1024));

		List<Case> cases = caseRepository.findAllByOrderByReceivedAtDesc();

		assertThat(cases).extracting(Case::getId).containsExactly(newer.getId(), older.getId());
	}

	@Test
	void knowsWhichMessageIdsWereAlreadyIngested() {
		caseRepository.save(new Case("<seen@test>", "a@example.com", "Subject", "body", Instant.now(), false, 1024));

		assertThat(caseRepository.existsByMessageId("<seen@test>")).isTrue();
		assertThat(caseRepository.existsByMessageId("<unseen@test>")).isFalse();
	}
}
