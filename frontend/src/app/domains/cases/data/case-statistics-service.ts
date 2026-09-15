import { httpResource } from '@angular/common/http';
import { Service } from '@angular/core';

import { CaseStatistics } from '../model/case-statistics';

/**
 * The sums behind the dashboard. Read once when the page opens; the page reloads on request. The
 * list the inbox polls is a different thing entirely — this asks for numbers, not for cases.
 */
@Service()
export class CaseStatisticsService {
  readonly statistics = httpResource<CaseStatistics>(() => '/api/cases/statistics');
}
