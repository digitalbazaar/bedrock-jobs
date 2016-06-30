# bedrock-jobs ChangeLog

## [Unreleased]

### Fixed
- Fix updating start of job schedule. Updating the start datetime
  for a job schedule now leaves the period alone.

## [2.0.2] - 2016-06-07

### Changed
- Update dependencies.

## [2.0.1] - 2016-03-15

### Changed
- Update bedrock dependencies.

## [2.0.0] - 2016-03-03

### Changed
- Update package dependencies for npm v3 compatibility.

## [1.0.1] - 2015-05-07

### Changed
- Use https://github.com/digitalbazaar/moment-interval fork.

### Fixed
- Fix bug from conversion to `moment-interval`.
- Emit scan events on `bedrock.ready`.
- Fix database result access.
- Fix schedule() error path when options not passed in and job has no type.

## [1.0.0] - 2015-04-08

### Changed
- Switch from bundled `iso8601` library to `moment-interval`.

## 0.1.0 - 2015-02-16

- See git history for changes.

[Unreleased]: https://github.com/digitalbazaar/bedrock-jobs/compare/2.0.2...HEAD
[2.0.2]: https://github.com/digitalbazaar/bedrock-jobs/compare/2.0.1...2.0.2
[2.0.1]: https://github.com/digitalbazaar/bedrock-jobs/compare/2.0.0...2.0.1
[2.0.0]: https://github.com/digitalbazaar/bedrock-jobs/compare/1.0.1...2.0.0
[1.0.1]: https://github.com/digitalbazaar/bedrock-jobs/compare/1.0.0...1.0.1
[1.0.0]: https://github.com/digitalbazaar/bedrock-jobs/compare/0.1.0...1.0.0
