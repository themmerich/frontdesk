import { httpResource } from '@angular/common/http';
import { Service } from '@angular/core';

import { Case } from '../model/case';

/** The wire shape: receivedAt is an ISO string until it is parsed into a Date. */
type CaseResponse = Omit<Case, 'receivedAt'> & { receivedAt: string };

@Service()
export class CasesService {
  readonly cases = httpResource<Case[]>(() => '/api/cases', {
    defaultValue: [],
    parse: (cases) => (cases as CaseResponse[]).map((item) => ({ ...item, receivedAt: new Date(item.receivedAt) })),
  });
}
