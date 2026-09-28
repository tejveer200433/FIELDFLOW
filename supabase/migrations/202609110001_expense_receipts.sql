-- Private expense proof. Reuse expenses.receipt_url to store an object path.
-- Existing expense rows remain valid without a receipt.
begin;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('expense-receipts', 'expense-receipts', false, 4194304,
        array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy expense_receipts_insert on storage.objects
for insert to authenticated with check (
  bucket_id = 'expense-receipts'
  and public.has_permission('expenses.submit')
  and (storage.foldername(name))[1] = auth.uid()::text
  and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$'
);

create policy expense_receipts_select on storage.objects
for select to authenticated using (
  bucket_id = 'expense-receipts'
  and (
    ((storage.foldername(name))[1] = auth.uid()::text and public.has_permission('expenses.submit'))
    or exists (
      select 1 from public.expenses expense
      where expense.receipt_url = name
        and (public.is_owner(auth.uid()) or (
          public.has_permission('expenses.approve')
          and (public.has_permission('employees.view_all') or public.is_team_supervisor_for(expense.employee_id))
        ))
    )
  )
);

-- Failed submissions may clean up their unlinked upload. Submitted proof is
-- immutable to employees: there is no UPDATE policy and referenced files
-- cannot be deleted through this policy.
create policy expense_receipts_cleanup on storage.objects
for delete to authenticated using (
  bucket_id = 'expense-receipts'
  and (storage.foldername(name))[1] = auth.uid()::text
  and public.has_permission('expenses.submit')
  and not exists (select 1 from public.expenses expense where expense.receipt_url = name)
);

-- Prevent direct database clients from attaching another employee's upload or
-- replacing already-submitted proof while leaving ordinary review updates intact.
create or replace function public.guard_expense_receipt()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.receipt_url is distinct from old.receipt_url
       or (old.receipt_url is not null and new.employee_id is distinct from old.employee_id) then
      raise exception 'Submitted expense proof cannot be replaced';
    end if;
    return new;
  end if;
  if new.receipt_url is not null then
    if new.employee_id is distinct from auth.uid()
       or new.receipt_url !~ ('^' || new.employee_id::text || '/[0-9a-f-]{36}\.(pdf|jpg|png|webp)$') then
      raise exception 'Receipt must belong to the submitting employee';
    end if;
    if not exists (select 1 from storage.objects
                   where bucket_id = 'expense-receipts' and name = new.receipt_url) then
      raise exception 'Upload the receipt before submitting the expense';
    end if;
  end if;
  return new;
end;
$$;

create trigger expenses_guard_receipt
before insert or update on public.expenses
for each row execute function public.guard_expense_receipt();

commit;
