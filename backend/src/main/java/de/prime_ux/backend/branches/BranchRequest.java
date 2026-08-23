package de.prime_ux.backend.branches;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

/**
 * Create and update share the same shape. Marking a branch as the headquarters demotes the
 * previous one, so a company always has at most one. The flag is a primitive on purpose: a body
 * omitting it is rejected, so whether a site is the headquarters is always stated, never implied.
 */
record BranchRequest(@NotBlank String name, boolean headquarters, String street, String postalCode, String city,
		String country, String phone, String fax, @Email String email) {
}
