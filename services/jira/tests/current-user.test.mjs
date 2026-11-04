import { currentUserContract } from '../../../tests/helpers/http.mjs';
currentUserContract('jira', '/rest/api/2/myself', 8081);
