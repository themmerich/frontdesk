package de.prime_ux.backend.replies;

import de.prime_ux.backend.branches.Branch;
import de.prime_ux.backend.tenants.Tenant;
import de.prime_ux.backend.users.AppUser;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Fills in a signature template: {@code {{vorname}}}, {@code {{firma}}}, {@code {{ort}}} and the
 * like become what they stand for. One template per company; the branches differ through their
 * data, so every branch gets its own signature without its own text.
 *
 * <p>A line whose placeholders all come up empty is dropped — "Tel. {{telefon}}" is not worth
 * keeping as "Tel." — and a placeholder nobody knows stays as written, so a typo shows in the
 * draft rather than vanishing. No template engine: fifteen names and a loop over the lines.
 */
public final class SignatureRenderer {

	/** {{name}}, with room for spaces inside the braces; the name is what is looked up. */
	private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{\\s*([A-Za-z]+)\\s*}}");

	private SignatureRenderer() {
	}

	/**
	 * @param template the company's signature, with or without placeholders
	 * @param company whose signature it is
	 * @param person who signs; null when nobody does, which leaves the person lines out
	 * @param headquarters the branch to name when the person has none, or there is no person; may
	 * be null
	 * @return the signature as it goes under a reply; empty when nothing is left of it
	 */
	public static String render(String template, Tenant company, AppUser person, Branch headquarters) {
		if (template == null || template.isBlank()) {
			return "";
		}
		Map<String, String> values = valuesOf(company, person, branchOf(person, headquarters));
		List<String> lines = new ArrayList<>();
		for (String line : template.split("\\R", -1)) {
			String rendered = renderLine(line, values);
			if (rendered != null) {
				lines.add(rendered);
			}
		}
		return String.join("\n", lines).strip();
	}

	/** The person's own branch where they have one, the headquarters otherwise. */
	private static Branch branchOf(AppUser person, Branch headquarters) {
		return person != null && person.getBranch() != null ? person.getBranch() : headquarters;
	}

	/** Null for a line to drop: it had placeholders, and every one of them came up empty. */
	private static String renderLine(String line, Map<String, String> values) {
		Matcher matcher = PLACEHOLDER.matcher(line);
		StringBuilder rendered = new StringBuilder();
		int known = 0;
		int filled = 0;
		while (matcher.find()) {
			String value = values.get(matcher.group(1).toLowerCase(java.util.Locale.ROOT));
			if (value == null) {
				// Not one of ours: left as written, so whoever wrote it sees the typo.
				matcher.appendReplacement(rendered, Matcher.quoteReplacement(matcher.group()));
				continue;
			}
			known++;
			if (!value.isBlank()) {
				filled++;
			}
			matcher.appendReplacement(rendered, Matcher.quoteReplacement(value.strip()));
		}
		matcher.appendTail(rendered);
		if (known > 0 && filled == 0) {
			return null;
		}
		return rendered.toString().stripTrailing();
	}

	private static Map<String, String> valuesOf(Tenant company, AppUser person, Branch branch) {
		Map<String, String> values = new LinkedHashMap<>();
		values.put("vorname", person == null ? "" : orEmpty(person.getFirstName()));
		values.put("nachname", person == null ? "" : orEmpty(person.getLastName()));
		values.put("position", person == null ? "" : orEmpty(person.getPosition()));
		values.put("telefon", person == null ? "" : orEmpty(person.getPhone()));
		values.put("fax", person == null ? "" : orEmpty(person.getFax()));
		values.put("email", person == null ? "" : orEmpty(person.getEmail()));
		values.put("firma", orEmpty(company.getName()));
		values.put("website", orEmpty(company.getWebsite()));
		values.put("filiale", branch == null ? "" : orEmpty(branch.getName()));
		values.put("strasse", branch == null ? "" : orEmpty(branch.getStreet()));
		values.put("plz", branch == null ? "" : orEmpty(branch.getPostalCode()));
		values.put("ort", branch == null ? "" : orEmpty(branch.getCity()));
		values.put("filialtelefon", branch == null ? "" : orEmpty(branch.getPhone()));
		values.put("filialfax", branch == null ? "" : orEmpty(branch.getFax()));
		values.put("filialemail", branch == null ? "" : orEmpty(branch.getEmail()));
		return values;
	}

	private static String orEmpty(String value) {
		return value == null ? "" : value;
	}
}
