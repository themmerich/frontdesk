package de.prime_ux.backend.replies;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * The draft as a person left it. Never empty: a draft with nothing in it is no draft, and the
 * page offers no way to delete one — what is not wanted is simply not sent.
 */
record EditDraftRequest(@NotBlank @Size(max = 20_000) String text) {
}
