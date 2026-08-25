package de.prime_ux.backend.triage;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * Turns a classification into the tier a case lands in. Deterministic on purpose: what the model
 * says is what kind of mail this is, what happens with it is the tenant's policy — a category's
 * tier, plus one safety net.
 *
 * <p>The safety net: below the tenant's confidence threshold a case drops one tier. Rather one
 * draft too many than a wrong automatic answer. A mail that fits no category at all goes to a
 * person unchanged.
 */
final class TriageRule {

	private TriageRule() {
	}

	/** The category the verdict names, or empty when it names none of this tenant's. */
	static Optional<CaseCategory> categoryOf(TriageVerdict verdict, List<CaseCategory> categories) {
		if (verdict.categoryCode() == null || verdict.categoryCode().isBlank()) {
			return Optional.empty();
		}
		return categories.stream()
				.filter(category -> category.getCode().equalsIgnoreCase(verdict.categoryCode().trim()))
				.findFirst();
	}

	/** The tier a case with this verdict lands in. */
	static CaseTier tierOf(TriageVerdict verdict, Optional<CaseCategory> category, BigDecimal threshold) {
		// Nothing fitted, so nobody but a person can judge this one.
		if (category.isEmpty()) {
			return CaseTier.MANUAL;
		}
		CaseTier tier = category.get().getTier();
		return isCertainEnough(verdict.confidence(), threshold) ? tier : downgrade(tier);
	}

	/** A missing confidence counts as uncertain: an answer without one says nothing about itself. */
	private static boolean isCertainEnough(BigDecimal confidence, BigDecimal threshold) {
		return confidence != null && confidence.compareTo(threshold) >= 0;
	}

	private static CaseTier downgrade(CaseTier tier) {
		return switch (tier) {
			case AUTOMATIC -> CaseTier.DRAFT;
			case DRAFT, MANUAL -> CaseTier.MANUAL;
		};
	}
}
