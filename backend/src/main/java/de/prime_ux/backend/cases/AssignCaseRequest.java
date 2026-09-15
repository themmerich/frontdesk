package de.prime_ux.backend.cases;

import java.util.UUID;

/**
 * Who is to have the case. Null hands it back to nobody, which is a choice like any other: a case
 * somebody put down is not the same as one nobody ever picked up, but the queue only needs to
 * know that it is free again.
 */
record AssignCaseRequest(UUID userId) {
}
