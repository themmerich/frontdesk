package de.prime_ux.backend.auth;

import jakarta.validation.constraints.NotBlank;

record LoginRequest(@NotBlank String username, @NotBlank String password) {
}
