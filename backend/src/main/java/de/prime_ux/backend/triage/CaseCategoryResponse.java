package de.prime_ux.backend.triage;

import java.util.Locale;
import java.util.UUID;

/**
 * A category as the admin page shows it. The code travels along read-only: it is what the model
 * answers with, and seeing it explains why a rename leaves the classification alone.
 *
 * <p>The case count is what makes the delete button honest: a category that cases point at cannot
 * be removed, and the page can say so before anyone clicks.
 */
record CaseCategoryResponse(UUID id, String code, String name, String description, String tier, String color,
		int sortOrder, boolean active, long caseCount) {

	static CaseCategoryResponse from(CaseCategory category, long caseCount) {
		return new CaseCategoryResponse(category.getId(), category.getCode(), category.getName(),
				category.getDescription(), category.getTier().name().toLowerCase(Locale.ROOT),
				category.getColor() == null ? null : category.getColor().name().toLowerCase(Locale.ROOT),
				category.getSortOrder(), category.isActive(), caseCount);
	}
}
