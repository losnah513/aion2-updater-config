-- Cover the acknowledgement actor foreign key for administrator deletion/update checks.
create index member_image_requests_acknowledged_by_idx
  on private.member_image_requests (acknowledged_by_member_id)
  where acknowledged_by_member_id is not null;

comment on index private.member_image_requests_acknowledged_by_idx is
  'Supports the v444 acknowledgement actor foreign key without exposing request rows.';
