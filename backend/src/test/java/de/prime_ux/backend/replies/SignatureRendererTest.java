package de.prime_ux.backend.replies;

import static org.assertj.core.api.Assertions.assertThat;

import de.prime_ux.backend.branches.Branch;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.users.AppUser;
import de.prime_ux.backend.users.UserRole;
import org.junit.jupiter.api.Test;

/** The template rules, without Spring: what becomes of a line depends on what its names find. */
class SignatureRendererTest {

	private static final String TEMPLATE = """
			Mit freundlichen Grüßen

			{{vorname}} {{nachname}}
			{{position}}
			Tel. {{telefon}} · Fax {{fax}}
			{{email}}

			{{firma}} · {{filiale}}
			{{strasse}}, {{plz}} {{ort}}
			Tel. {{filialtelefon}}
			{{website}}
			""";

	private final Tenant company = company();

	private static Tenant company() {
		Tenant tenant = new Tenant("Pfenning Elektroanlagen GmbH");
		tenant.updateCompany(tenant.getName(), "https://pfenning.example", tenant.getLogoDisplay(), null, "", null);
		return tenant;
	}

	private Branch branch(String name, boolean headquarters, String city, String phone) {
		Branch branch = new Branch(company, name, headquarters);
		branch.update(name, headquarters, "Hauptstraße 1", "68159", city, "DE", phone, null, null);
		return branch;
	}

	private AppUser person(Branch branch) {
		AppUser person = new AppUser(company, "anna", "Anna", "Admin", "{noop}irrelevant", UserRole.ADMIN);
		person.updateProfile("Anna", "Admin", null, null, branch, "anna@pfenning.example", "0621 123456", null,
				"Projektleiterin");
		return person;
	}

	@Test
	void fillsInThePersonTheirBranchAndTheCompany() {
		Branch mannheim = branch("Niederlassung Mannheim", false, "Mannheim", "0621 999");

		String signature = SignatureRenderer.render(TEMPLATE, company, person(mannheim),
				branch("Zentrale", true, "Heidelberg", "06221 1"));

		// The fax line lost its fax but kept its phone; the person's branch beat the headquarters.
		assertThat(signature).isEqualTo("""
				Mit freundlichen Grüßen

				Anna Admin
				Projektleiterin
				Tel. 0621 123456 · Fax
				anna@pfenning.example

				Pfenning Elektroanlagen GmbH · Niederlassung Mannheim
				Hauptstraße 1, 68159 Mannheim
				Tel. 0621 999
				https://pfenning.example""");
	}

	@Test
	void dropsTheLinesWhosePlaceholdersAllComeUpEmpty() {
		AppUser withoutContactData = new AppUser(company, "ben", "Ben", "Benutzer", "{noop}irrelevant",
				UserRole.USER);

		String signature = SignatureRenderer.render(TEMPLATE, company, withoutContactData, null);

		// No position, no phone, no e-mail, no branch anywhere: those lines are gone, the rest stays.
		assertThat(signature).isEqualTo("""
				Mit freundlichen Grüßen

				Ben Benutzer

				Pfenning Elektroanlagen GmbH ·
				https://pfenning.example""");
	}

	@Test
	void signsWithTheHeadquartersWhenThereIsNobody() {
		String signature = SignatureRenderer.render("{{vorname}} {{nachname}}\n{{firma}}, {{ort}}", company, null,
				branch("Zentrale", true, "Heidelberg", null));

		// The scheduler at work: no person, so only the company and its headquarters sign.
		assertThat(signature).isEqualTo("Pfenning Elektroanlagen GmbH, Heidelberg");
	}

	@Test
	void takesTheHeadquartersForAPersonWithoutABranch() {
		String signature = SignatureRenderer.render("{{nachname}}, {{filiale}}", company, person(null),
				branch("Zentrale", true, "Heidelberg", null));

		assertThat(signature).isEqualTo("Admin, Zentrale");
	}

	@Test
	void leavesAnUnknownPlaceholderAsWritten() {
		String signature = SignatureRenderer.render("{{nachname}} – {{abteilung}}\n{{ nachname }}", company,
				person(null), null);

		// A typo shows in the draft rather than vanishing; spaces inside the braces are fine.
		assertThat(signature).isEqualTo("Admin – {{abteilung}}\nAdmin");
	}

	@Test
	void keepsALineWithoutPlaceholdersAndTrimsTheEnds() {
		String signature = SignatureRenderer.render("\n\nMit freundlichen Grüßen\n{{telefon}}\n\n", company,
				null, null);

		assertThat(signature).isEqualTo("Mit freundlichen Grüßen");
	}

	@Test
	void isEmptyWhenNothingIsLeft() {
		assertThat(SignatureRenderer.render("{{vorname}}\n{{telefon}}", company, null, null)).isEmpty();
		assertThat(SignatureRenderer.render("   ", company, null, null)).isEmpty();
		assertThat(SignatureRenderer.render(null, company, null, null)).isEmpty();
	}
}
