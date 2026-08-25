package de.prime_ux.backend.triage;

import java.util.Locale;
import java.util.UUID;

/**
 * A category as the admin page shows it. The code travels along read-only: it is what the model
 * answers with, and seeing it explains why a rename leaves the classification alone.
 */
record CaseCategoryResponse(UUID id, String code, String name, String description, String tier, int sortOrder,
		boolean active) {

	static CaseCategoryResponse from(CaseCategory category) {
		return new CaseCategoryResponse(category.getId(), category.getCode(), category.getName(),
				category.getDescription(), category.getTier().name().toLowerCase(Locale.ROOT),
				category.getSortOrder(), category.isActive());
	}
}
