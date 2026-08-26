package de.prime_ux.backend.triage;

import de.prime_ux.backend.tenants.Tenant;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/**
 * The rule is where the tenant's policy lives, so it is tested without a database or a model —
 * everything it needs is the verdict, the categories, and the threshold.
 */
class TriageRuleTest {

	private static final BigDecimal THRESHOLD = new BigDecimal("0.80");

	private final Tenant tenant = new Tenant("Musterfirma GmbH");
	private final CaseCategory orderStatus = new CaseCategory(tenant, "ORDER_STATUS", "Statusanfrage",
			"Frage nach dem Liefertermin.", CaseTier.AUTOMATIC, 0);
	private final CaseCategory inquiry = new CaseCategory(tenant, "GENERAL_INQUIRY", "Anfrage",
			"Allgemeine Frage.", CaseTier.DRAFT, 1);
	private final CaseCategory invoice = new CaseCategory(tenant, "INVOICE", "Rechnung", "Eingehende Rechnung.",
			CaseTier.MANUAL, 2);
	private final CaseCategory confirmation = new CaseCategory(tenant, "ORDER_CONFIRMATION", "Bestätigung",
			"Reine Mitteilung ohne Frage.", CaseTier.INFO, 3);
	private final CaseCategory marketing = new CaseCategory(tenant, "MARKETING", "Werbung",
			"Unaufgeforderte Werbung.", CaseTier.IGNORE, 4);
	private final List<CaseCategory> categories = List.of(orderStatus, inquiry, invoice, confirmation,
			marketing);

	private CaseTier tierFor(String code, String confidence) {
		TriageVerdict verdict = new TriageVerdict(code, confidence == null ? null : new BigDecimal(confidence),
				"Zusammenfassung.");
		return TriageRule.tierOf(verdict, TriageRule.categoryOf(verdict, categories), THRESHOLD);
	}

	@Test
	void takesTheTierFromTheCategoryWhenTheModelIsCertain() {
		assertThat(tierFor("ORDER_STATUS", "0.95")).isEqualTo(CaseTier.AUTOMATIC);
		assertThat(tierFor("GENERAL_INQUIRY", "0.95")).isEqualTo(CaseTier.DRAFT);
		assertThat(tierFor("INVOICE", "0.95")).isEqualTo(CaseTier.MANUAL);
		assertThat(tierFor("ORDER_CONFIRMATION", "0.95")).isEqualTo(CaseTier.INFO);
		assertThat(tierFor("MARKETING", "0.95")).isEqualTo(CaseTier.IGNORE);
	}

	@Test
	void countsTheThresholdItselfAsCertainEnough() {
		assertThat(tierFor("ORDER_STATUS", "0.80")).isEqualTo(CaseTier.AUTOMATIC);
	}

	@Test
	void movesOneStepTowardsAPersonBelowTheThreshold() {
		// Rather one draft too many than a wrong automatic answer.
		assertThat(tierFor("ORDER_STATUS", "0.79")).isEqualTo(CaseTier.DRAFT);
		assertThat(tierFor("GENERAL_INQUIRY", "0.4")).isEqualTo(CaseTier.MANUAL);
		// A mail nobody was going to answer now wants a pair of eyes on it.
		assertThat(tierFor("ORDER_CONFIRMATION", "0.4")).isEqualTo(CaseTier.MANUAL);
		// Not straight to manual: a glance first, rather than work in the queue.
		assertThat(tierFor("MARKETING", "0.4")).isEqualTo(CaseTier.INFO);
		// Manual is where everything converges.
		assertThat(tierFor("INVOICE", "0.1")).isEqualTo(CaseTier.MANUAL);
	}

	@Test
	void letsNoUncertainCaseDisappearUnseen() {
		// Whatever the tier, an uncertain verdict ends up where a person looks.
		for (CaseTier tier : CaseTier.values()) {
			assertThat(tier.whenUncertain()).isIn(CaseTier.DRAFT, CaseTier.MANUAL, CaseTier.INFO);
		}
		// … and never further from a person than it started.
		assertThat(CaseTier.IGNORE.whenUncertain()).isEqualTo(CaseTier.INFO);
		assertThat(CaseTier.INFO.whenUncertain()).isEqualTo(CaseTier.MANUAL);
		assertThat(CaseTier.MANUAL.whenUncertain()).isEqualTo(CaseTier.MANUAL);
	}

	@Test
	void treatsAMissingConfidenceAsUncertain() {
		// An answer that says nothing about itself is not one to act on.
		assertThat(tierFor("ORDER_STATUS", null)).isEqualTo(CaseTier.DRAFT);
	}

	@Test
	void sendsAMailThatFitsNoCategoryToAPerson() {
		assertThat(tierFor("", "0.99")).isEqualTo(CaseTier.MANUAL);
		assertThat(tierFor(null, "0.99")).isEqualTo(CaseTier.MANUAL);
		// A code this tenant does not have is no better than none.
		assertThat(tierFor("SOMETHING_ELSE", "0.99")).isEqualTo(CaseTier.MANUAL);
	}

	@Test
	void findsTheCategoryRegardlessOfCasingAndPadding() {
		TriageVerdict verdict = new TriageVerdict(" order_status ", new BigDecimal("0.9"), "Zusammenfassung.");

		Optional<CaseCategory> category = TriageRule.categoryOf(verdict, categories);

		assertThat(category).containsSame(orderStatus);
	}
}
