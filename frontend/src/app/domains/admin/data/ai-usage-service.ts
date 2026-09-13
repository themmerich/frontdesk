import { httpResource } from '@angular/common/http';
import { Service } from '@angular/core';

import { AiUsage } from '../model/ai-usage';

/** The sums behind the cost page. Read once when the page opens; the page reloads on request. */
@Service()
export class AiUsageService {
  readonly usage = httpResource<AiUsage>(() => '/api/ai-usage');
}
