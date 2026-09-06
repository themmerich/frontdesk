package de.prime_ux.backend.cases;

import java.util.UUID;

/**
 * The category a person files a case under. Null is a choice of its own: a case that fits none of
 * them is better left without one than pressed into the nearest.
 */
record ChangeCategoryRequest(UUID categoryId) {
}
