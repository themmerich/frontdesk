package de.prime_ux.backend.triage;

import java.math.BigDecimal;

/**
 * What the classification made of one mail: the code of the category it fits, how certain the
 * model is, and a one-line summary for the people reading the board later.
 *
 * <p>An unknown or empty code means the mail fits none of the tenant's categories — the case then
 * goes to a human rather than into a category it does not belong to.
 */
public record TriageVerdict(String categoryCode, BigDecimal confidence, String summary) {
}
