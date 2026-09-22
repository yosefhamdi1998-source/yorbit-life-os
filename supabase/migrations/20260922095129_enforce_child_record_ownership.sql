-- Child records must belong to the owner of their parent, including updates.
alter policy advisor_messages_insert_own on public.advisor_messages
  with check (auth.uid() = user_id and exists (
    select 1 from public.advisor_conversations c
    where c.id = advisor_messages.conversation_id and c.user_id = auth.uid()
  ));
alter policy custom_records_update_own on public.custom_records
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id and exists (
    select 1 from public.custom_forms f
    where f.id = custom_records.form_id and f.user_id = auth.uid()
  ));
