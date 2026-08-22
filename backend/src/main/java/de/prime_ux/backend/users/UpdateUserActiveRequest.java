package de.prime_ux.backend.users;

import jakarta.validation.constraints.NotNull;

public record UpdateUserActiveRequest(@NotNull Boolean active) {
}
