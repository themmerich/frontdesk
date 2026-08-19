package de.prime_ux.backend.note;

import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
class NoteExceptionHandler {

	@ExceptionHandler(NoteNotFoundException.class)
	ProblemDetail handleNotFound(NoteNotFoundException exception) {
		return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, exception.getMessage());
	}
}
