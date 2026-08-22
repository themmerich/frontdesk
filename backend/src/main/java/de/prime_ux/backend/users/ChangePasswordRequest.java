package de.prime_ux.backend.users;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

record ChangePasswordRequest(@NotBlank String currentPassword, @NotBlank @Size(min = 8) String newPassword) {
}
