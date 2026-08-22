package de.prime_ux.backend.users;

import jakarta.validation.constraints.NotBlank;

record UpdateProfileRequest(@NotBlank String displayName) {
}
