import { currentUserContract } from '../../../tests/helpers/http.mjs';
currentUserContract('confluence', '/rest/api/user/current', 8082);
