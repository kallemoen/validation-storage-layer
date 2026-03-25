CREATE TABLE currencies (
  code        CHAR(3) PRIMARY KEY,
  name        VARCHAR(100) NOT NULL,
  symbol      VARCHAR(5)   NOT NULL,
  minor_units SMALLINT     NOT NULL DEFAULT 2
);
