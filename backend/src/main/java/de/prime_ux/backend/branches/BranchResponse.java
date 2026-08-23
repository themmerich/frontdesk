package de.prime_ux.backend.branches;

import java.util.UUID;

public record BranchResponse(UUID id, String name, boolean headquarters, String street, String postalCode,
		String city, String country, String phone, String fax, String email) {

	public static BranchResponse from(Branch branch) {
		return new BranchResponse(branch.getId(), branch.getName(), branch.isHeadquarters(), branch.getStreet(),
				branch.getPostalCode(), branch.getCity(), branch.getCountry(), branch.getPhone(), branch.getFax(),
				branch.getEmail());
	}
}
