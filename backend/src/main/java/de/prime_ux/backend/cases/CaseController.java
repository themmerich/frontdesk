package de.prime_ux.backend.cases;

import java.util.List;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/cases")
class CaseController {

	private final CaseRepository caseRepository;

	CaseController(CaseRepository caseRepository) {
		this.caseRepository = caseRepository;
	}

	@GetMapping
	List<CaseResponse> listCases() {
		return caseRepository.findAllByOrderByReceivedAtDesc().stream().map(CaseResponse::from).toList();
	}
}
