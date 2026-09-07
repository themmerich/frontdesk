package de.prime_ux.backend.cases;

import jakarta.validation.constraints.NotNull;

/**
 * Whether a person has taken note of a case. Both directions travel through the same request: a
 * click on "erledigt" is undone by the same click again, and a mistake at the top of a list of
 * twenty summaries must not need a detour.
 *
 * <p>Boxed and required rather than a primitive: a body without the field would silently mean
 * "not handled" and quietly undo what was just marked.
 */
record MarkHandledRequest(@NotNull Boolean handled) {
}
