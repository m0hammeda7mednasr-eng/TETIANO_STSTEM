-- Optional:
-- Add `where store_id = 'YOUR_STORE_ID'` to the UPDATE statements below
-- if you want to reset one store only instead of every store.

update public.products
set
  inventory_quantity = 0,
  updated_at = now(),
  data = case
    when jsonb_typeof(coalesce(data, '{}'::jsonb)) = 'object' then
      jsonb_set(
        case
          when jsonb_typeof(coalesce(data, '{}'::jsonb)->'variants') = 'array' then
            jsonb_set(
              coalesce(data, '{}'::jsonb),
              '{variants}',
              coalesce(
                (
                  select jsonb_agg(
                    case
                      when jsonb_typeof(variant_item) = 'object' then
                        jsonb_set(variant_item, '{inventory_quantity}', '0'::jsonb, true)
                      else
                        variant_item
                    end
                  )
                  from jsonb_array_elements(coalesce(data, '{}'::jsonb)->'variants') as variant_item
                ),
                '[]'::jsonb
              ),
              true
            )
          else
            coalesce(data, '{}'::jsonb)
        end,
        '{inventory_quantity}',
        '0'::jsonb,
        true
      )
    else
      jsonb_build_object('inventory_quantity', 0)
  end;

update public.warehouse_inventory
set
  quantity = 0,
  last_movement_quantity = 0,
  last_scanned_at = now(),
  updated_at = now();

-- Optional clean start for scanner history too:
-- delete from public.warehouse_scan_events;
