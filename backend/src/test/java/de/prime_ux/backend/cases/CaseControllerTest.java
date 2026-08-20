package de.prime_ux.backend.cases;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import de.prime_ux.backend.TestcontainersConfiguration;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest(properties = "frontdesk.mail.polling-enabled=false")
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class CaseControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private CaseRepository caseRepository;

	@BeforeEach
	void cleanDatabase() {
		caseRepository.deleteAll();
	}

	@Test
	void listsCasesNewestFirst() throws Exception {
		caseRepository.save(new Case("<first@test>", "anna@example.com", "Delivery status", "body",
				Instant.parse("2026-08-01T10:00:00Z"), false, 2048));
		caseRepository.save(new Case("<second@test>", "ben@example.com", "Invoice copy", "body",
				Instant.parse("2026-08-02T10:00:00Z"), true, 512_000));

		mockMvc.perform(get("/api/cases"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(2))
				.andExpect(jsonPath("$[0].sender").value("ben@example.com"))
				.andExpect(jsonPath("$[0].subject").value("Invoice copy"))
				.andExpect(jsonPath("$[0].hasAttachments").value(true))
				.andExpect(jsonPath("$[0].sizeBytes").value(512_000))
				.andExpect(jsonPath("$[1].sender").value("anna@example.com"))
				.andExpect(jsonPath("$[1].hasAttachments").value(false));
	}

	@Test
	void returnsAnEmptyListWhenNoCasesExist() throws Exception {
		mockMvc.perform(get("/api/cases"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.length()").value(0));
	}
}
