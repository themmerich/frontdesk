package de.prime_ux.backend.tenants;

/**
 * Why a request was refused with 409, named so the page can put the message under the right
 * field: {@code slug} when the Kennung is taken.
 */
record ConflictResponse(String reason) {
}
