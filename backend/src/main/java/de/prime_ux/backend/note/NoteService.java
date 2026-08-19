package de.prime_ux.backend.note;

import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class NoteService {

	private final NoteRepository notes;

	public NoteService(NoteRepository notes) {
		this.notes = notes;
	}

	public List<Note> findAll() {
		return notes.findAll();
	}

	public Note findById(Long id) {
		return notes.findById(id).orElseThrow(() -> new NoteNotFoundException(id));
	}

	@Transactional
	public Note create(NoteRequest request) {
		return notes.save(new Note(request.title(), request.content()));
	}

	@Transactional
	public Note update(Long id, NoteRequest request) {
		Note note = findById(id);
		note.setTitle(request.title());
		note.setContent(request.content());
		return note;
	}

	@Transactional
	public void delete(Long id) {
		if (!notes.existsById(id)) {
			throw new NoteNotFoundException(id);
		}
		notes.deleteById(id);
	}
}
