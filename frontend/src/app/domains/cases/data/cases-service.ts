import { httpResource } from '@angular/common/http';
import { Service } from '@angular/core';

import { Case } from '../model/case';

@Service()
export class CasesService {
  readonly cases = httpResource<Case[]>(() => '/api/cases', { defaultValue: [] });
}
