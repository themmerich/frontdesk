package de.prime_ux.backend.users;

import java.time.LocalDate;
import java.util.UUID;

record ProfileResponse(String username, String firstName, String lastName, LocalDate birthDate,
		LocalDate joinedAt, UUID branchId, String email, String phone, String fax) {

	static ProfileResponse from(AppUser user) {
		return new ProfileResponse(user.getUsername(), user.getFirstName(), user.getLastName(),
				user.getBirthDate(), user.getJoinedAt(),
				user.getBranch() == null ? null : user.getBranch().getId(), user.getEmail(), user.getPhone(),
				user.getFax());
	}
}
