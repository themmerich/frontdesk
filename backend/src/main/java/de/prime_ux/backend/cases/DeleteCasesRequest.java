package de.prime_ux.backend.cases;

import jakarta.validation.constraints.NotEmpty;
import java.util.List;
import java.util.UUID;

/**
 * The cases to delete. A list rather than a path variable, because the inbox deletes a selection
 * in one go and a row action is simply a selection of one — one round trip, one transaction, one
 * answer.
 */
record DeleteCasesRequest(@NotEmpty List<UUID> ids) {
}
