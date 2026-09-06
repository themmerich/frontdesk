package de.prime_ux.backend.triage;

import java.util.Locale;
import java.util.UUID;

/**
 * A category as a person picks it when filing a case: its name and the colour it is drawn in, and
 * nothing else. What a category is for, how sure the model has to be and how many cases point at
 * it are the admin's business, and this is read by everyone.
 */
record SelectableCategoryResponse(UUID id, String name, String color) {

	static SelectableCategoryResponse from(CaseCategory category) {
		return new SelectableCategoryResponse(category.getId(), category.getName(),
				category.getColor() == null ? null : category.getColor().name().toLowerCase(Locale.ROOT));
	}
}
