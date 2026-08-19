package de.prime_ux.backend.note;

import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/notes")
public class NoteController {

	private final NoteService notes;

	public NoteController(NoteService notes) {
		this.notes = notes;
	}

	@GetMapping
	public List<NoteResponse> findAll() {
		return notes.findAll().stream().map(NoteResponse::from).toList();
	}

	@GetMapping("/{id}")
	public NoteResponse findById(@PathVariable Long id) {
		return NoteResponse.from(notes.findById(id));
	}

	@PostMapping
	public ResponseEntity<NoteResponse> create(@Valid @RequestBody NoteRequest request) {
		Note created = notes.create(request);
		return ResponseEntity.created(URI.create("/api/notes/" + created.getId())).body(NoteResponse.from(created));
	}

	@PutMapping("/{id}")
	public NoteResponse update(@PathVariable Long id, @Valid @RequestBody NoteRequest request) {
		return NoteResponse.from(notes.update(id, request));
	}

	@DeleteMapping("/{id}")
	public ResponseEntity<Void> delete(@PathVariable Long id) {
		notes.delete(id);
		return ResponseEntity.noContent().build();
	}
}
