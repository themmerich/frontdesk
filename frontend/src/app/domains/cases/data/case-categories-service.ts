import { httpResource } from '@angular/common/http';
import { Service } from '@angular/core';

import { SelectableCategory } from '../model/case';

/**
 * The categories a case can be filed under, as the inbox sees them: name and colour, nothing else.
 * The administration has its own view of the same categories — this one is read by everyone who
 * works with cases, and it is a read of its own rather than a look into the admin's list.
 */
@Service()
export class CaseCategoriesService {
  readonly categories = httpResource<SelectableCategory[]>(() => '/api/case-categories/selectable', {
    defaultValue: [],
  });
}
