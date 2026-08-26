package de.prime_ux.backend.triage;

import de.prime_ux.backend.tenants.Tenant;

import java.util.List;
import java.util.stream.IntStream;

/**
 * The categories a tenant starts with, meant for a small B2B business. German because de is the
 * app's default language and these rows are tenant data, not translatable UI text — a tenant
 * renames them to its own wording.
 *
 * <p>Only the status inquiry is answered automatically, because its answer is a data lookup
 * rather than a formulation. Everything a wrong answer could cost something starts as MANUAL;
 * loosening that is a tenant's decision, made once they trust the classification. The two kinds
 * of mail that need no answer at all keep the manual queue clear of them.
 */
final class TriageDefaults {

	private TriageDefaults() {
	}

	/** Code, name, description, and tier of one default category. */
	private record DefaultCategory(String code, String name, String description, CaseTier tier) {
	}

	private static final List<DefaultCategory> CATEGORIES = List.of(
			new DefaultCategory("ORDER_STATUS", "Statusanfrage Bestellung",
					"Der Absender fragt nach dem Stand, dem Liefertermin oder dem Versand einer bestehenden "
							+ "Bestellung. Nennt meist eine Bestell-, Auftrags- oder Lieferscheinnummer.",
					CaseTier.AUTOMATIC),
			new DefaultCategory("GENERAL_INQUIRY", "Allgemeine Anfrage",
					"Frage zu Produkten, Preisen, Verfügbarkeit oder Konditionen, die sich nicht auf eine "
							+ "bestehende Bestellung bezieht. Auch Angebotsanfragen gehören hierher.",
					CaseTier.DRAFT),
			new DefaultCategory("ORDER_CONFIRMATION", "Bestätigung / Avis",
					"Bestätigung einer Bestellung, Versand- oder Liefermitteilung, Terminbestätigung. "
							+ "Reine Mitteilung ohne Frage — es ist keine Antwort nötig.",
					CaseTier.INFO),
			new DefaultCategory("INVOICE", "Rechnung",
					"Eingehende Rechnung, Mahnung oder Zahlungserinnerung. Meist ein kurzes Anschreiben mit "
							+ "einem PDF im Anhang; der Dateiname nennt oft Rechnungsnummer oder Datum.",
					CaseTier.MANUAL),
			new DefaultCategory("APPLICATION", "Bewerbung",
					"Bewerbung auf eine ausgeschriebene Stelle oder Initiativbewerbung, häufig mit Lebenslauf "
							+ "und Zeugnissen im Anhang.",
					CaseTier.MANUAL),
			new DefaultCategory("COMPLAINT", "Reklamation",
					"Beschwerde über eine Lieferung, eine Leistung oder eine Rechnung. Oft mit Fristsetzung, "
							+ "Mängelbeschreibung oder verärgertem Ton.",
					CaseTier.MANUAL),
			new DefaultCategory("MARKETING", "Werbung",
					"Unaufgeforderte Werbung, Newsletter oder Kaltakquise ohne konkretes Anliegen an den "
							+ "Betrieb.",
					CaseTier.IGNORE));

	/** Fresh category entities for the given tenant, numbered in the order listed above. */
	static List<CaseCategory> categoriesFor(Tenant tenant) {
		return IntStream.range(0, CATEGORIES.size()).mapToObj(position -> {
			DefaultCategory category = CATEGORIES.get(position);
			return new CaseCategory(tenant, category.code(), category.name(), category.description(),
					category.tier(), position);
		}).toList();
	}
}
