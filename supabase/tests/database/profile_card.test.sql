-- Disposable local database only; all fixtures roll back.
-- a = 801 (owner), b = 802 (friend), c = 803 (stranger), d = 804 (friend, then blocked).
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users(id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000801','00000000-0000-0000-0000-000000000000','authenticated','authenticated','card-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000802','00000000-0000-0000-0000-000000000000','authenticated','authenticated','card-b@example.invalid'),
  ('00000000-0000-4000-8000-000000000803','00000000-0000-0000-0000-000000000000','authenticated','authenticated','card-c@example.invalid'),
  ('00000000-0000-4000-8000-000000000804','00000000-0000-0000-0000-000000000000','authenticated','authenticated','card-d@example.invalid');
update public.profiles set display_name = 'An', username = 'card_an', bio = 'Thích cà phê', birthday = '2004-03-09' where id = '00000000-0000-4000-8000-000000000801';
update public.profiles set username = 'Card_Binh' where id = '00000000-0000-4000-8000-000000000802';
insert into public.friendships(requester_id, addressee_id, status) values
  ('00000000-0000-4000-8000-000000000801','00000000-0000-4000-8000-000000000802','accepted'),
  ('00000000-0000-4000-8000-000000000804','00000000-0000-4000-8000-000000000801','accepted');

-- The owner: everything, and a picture only in the shape the app makes.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000801',true);
select is((select bio || ' · ' || birthday from public.get_profile_card('00000000-0000-4000-8000-000000000801')), 'Thích cà phê · 03-09', 'the owner sees their own introduction and birthday');
select lives_ok($$update public.profiles set avatar_url = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==' where id = '00000000-0000-4000-8000-000000000801'$$, 'a small inline picture is stored');
select throws_ok($$update public.profiles set avatar_url = 'https://tracker.example/me.png' where id = '00000000-0000-4000-8000-000000000801'$$, '23514', null, 'a picture on someone''s own server is refused');
select throws_ok($$update public.profiles set avatar_url = 'data:image/svg+xml;base64,PHN2Zz4=' where id = '00000000-0000-4000-8000-000000000801'$$, '23514', null, 'so is a picture that can carry a script');
select throws_ok($$update public.profiles set avatar_url = 'data:image/jpeg;base64,' || repeat('A', 60000) where id = '00000000-0000-4000-8000-000000000801'$$, '23514', null, 'and one that is too large');
select throws_ok($$update public.profiles set bio = repeat('a', 501) where id = '00000000-0000-4000-8000-000000000801'$$, '23514', null, 'an introduction longer than the form allows is refused');
select throws_ok($$update public.profiles set profile_visibility = '{"birthday":"public"}' where id = '00000000-0000-4000-8000-000000000801'$$, '23514', null, 'a birthday cannot be shown to everyone');

-- Usernames: taken whatever the capitals, free when it is the person's own.
select is(public.username_available('card_binh'), false, 'a username someone else has is taken, whatever the capitals');
select is(public.username_available(' CARD_AN '), true, 'the person''s own username is free to keep');
select is(public.username_available('card_nobody'), true, 'a username nobody has is free');

-- A friend: the picture and the introduction, the birthday only once it is shown.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000802',true);
select is((select bio from public.get_profile_card('00000000-0000-4000-8000-000000000801')), 'Thích cà phê', 'a friend sees the introduction');
select is((select avatar_url from public.get_profile_card('00000000-0000-4000-8000-000000000801')), 'data:image/jpeg;base64,/9j/4AAQSkZJRg==', 'and the picture');
select is((select birthday from public.get_profile_card('00000000-0000-4000-8000-000000000801')), null, 'the birthday is private until its owner shows it');

select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000801',true);
update public.profiles set profile_visibility = '{"bio":"private","birthday":"friends"}' where id = '00000000-0000-4000-8000-000000000801';
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000802',true);
select is((select birthday from public.get_profile_card('00000000-0000-4000-8000-000000000801')), '03-09', 'a shown birthday comes without its year');
select is((select bio from public.get_profile_card('00000000-0000-4000-8000-000000000801')), null, 'an introduction made private is not sent');

-- A stranger and a blocked friend get no card. An anonymous visitor cannot ask at all.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000803',true);
select is((select count(*) from public.get_profile_card('00000000-0000-4000-8000-000000000801')), 0::bigint, 'a stranger gets no card');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000801',true);
select public.block_user('00000000-0000-4000-8000-000000000804');
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000804',true);
select is((select count(*) from public.get_profile_card('00000000-0000-4000-8000-000000000801')), 0::bigint, 'a blocked person gets no card');
reset role;
set local role anon;
select throws_ok($$select * from public.get_profile_card('00000000-0000-4000-8000-000000000801')$$, '42501', null, 'an anonymous visitor cannot open a card');
select throws_ok($$select public.username_available('card_an')$$, '42501', null, 'nor ask about usernames');
reset role;
select * from finish();
rollback;
