package de.prime_ux.backend.users;

import java.time.LocalDate;

record ProfileResponse(String username, String firstName, String lastName, LocalDate birthDate,
		LocalDate joinedAt, String company, String email, String phone, String fax) {

	static ProfileResponse from(AppUser user) {
		return new ProfileResponse(user.getUsername(), user.getFirstName(), user.getLastName(),
				user.getBirthDate(), user.getJoinedAt(), user.getCompany(), user.getEmail(), user.getPhone(),
				user.getFax());
	}
}
