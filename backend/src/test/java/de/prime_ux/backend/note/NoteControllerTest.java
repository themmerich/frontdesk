package de.prime_ux.backend.note;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import de.prime_ux.backend.TestcontainersConfiguration;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;

// Full-stack slice test: real controller → service → repository → PostgreSQL
// (Testcontainers), exercising every CRUD verb over HTTP.
@SpringBootTest
@AutoConfigureMockMvc
@Import(TestcontainersConfiguration.class)
class NoteControllerTest {

	@Autowired
	private MockMvc mockMvc;

	@Autowired
	private ObjectMapper objectMapper;

	@Autowired
	private NoteRepository notes;

	@BeforeEach
	void clearNotes() {
		notes.deleteAll();
	}

	@Test
	void supportsTheFullCrudLifecycle() throws Exception {
		String createBody = objectMapper.writeValueAsString(new NoteRequest("Groceries", "Milk and eggs"));

		String created = mockMvc
			.perform(post("/api/notes").contentType(MediaType.APPLICATION_JSON).content(createBody))
			.andExpect(status().isCreated())
			.andExpect(header().string("Location", org.hamcrest.Matchers.matchesPattern("/api/notes/\\d+")))
			.andExpect(jsonPath("$.title").value("Groceries"))
			.andExpect(jsonPath("$.createdAt").isNotEmpty())
			.andReturn()
			.getResponse()
			.getContentAsString();
		long id = objectMapper.readTree(created).get("id").asLong();

		mockMvc.perform(get("/api/notes")).andExpect(status().isOk()).andExpect(jsonPath("$", hasSize(1)));

		mockMvc
			.perform(get("/api/notes/{id}", id))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content").value("Milk and eggs"));

		String updateBody = objectMapper.writeValueAsString(new NoteRequest("Groceries", "Milk, eggs and bread"));
		mockMvc
			.perform(put("/api/notes/{id}", id).contentType(MediaType.APPLICATION_JSON).content(updateBody))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.content").value("Milk, eggs and bread"));

		mockMvc.perform(delete("/api/notes/{id}", id)).andExpect(status().isNoContent());
		mockMvc.perform(get("/api/notes/{id}", id)).andExpect(status().isNotFound());
	}

	@Test
	void rejectsABlankTitleWith400() throws Exception {
		String invalid = objectMapper.writeValueAsString(new NoteRequest("", "no title"));

		mockMvc
			.perform(post("/api/notes").contentType(MediaType.APPLICATION_JSON).content(invalid))
			.andExpect(status().isBadRequest());
	}

	@Test
	void returns404ForAnUnknownNote() throws Exception {
		mockMvc
			.perform(get("/api/notes/{id}", 9999))
			.andExpect(status().isNotFound())
			.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
	}
}
