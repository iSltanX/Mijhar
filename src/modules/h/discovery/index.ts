// اكتشاف المحتوى العربي وTrending وموسّع تهجئات location وضوابط عدم استنتاج الهوية (T-9.4، F-H4 وF-H6).
export { arabicScriptShare, isArabicContent } from './content';
export { buildAccountView, declaredEntries } from './declared';
export type { AccountFields, AccountView, ContentFinding, DeclaredEntry, DeclaredField, ProjectText } from './declared';
export { ARABIC_CONTENT_NOTICE, DECLARED_NOTICE, LOCATION_SEARCH_NOTICE } from './notices';
export { MAX_VARIANTS_PER_QUERY, PLACES, collectVariants, locationQueries } from './places';
export type { Place } from './places';
export { PROFILE_SELECTORS, readAccount, readPinnedProjects } from './profile-dom';
export { ARABIC_TOPICS, TRENDING_SINCE, arabicDescriptionQuery, arabicTopicsQuery, generatedProblems, locationQuery, quoteValue, searchUrl, trendingUrl } from './queries';
export type { GeneratedQuery, ProjectQueryOptions, TrendingOptions, TrendingSince } from './queries';
export { MAX_OPERATORS, MAX_TEXT_LENGTH, validateQuery } from './validate';
export type { IssueCode, QueryCheck, QueryIssue, SearchType } from './validate';
export { DiscoveryView, createDiscoveryView, trendingProblem } from './DiscoveryView';
export { QueryEditor } from './QueryEditor';
export { ProfileCard } from './ProfileCard';
