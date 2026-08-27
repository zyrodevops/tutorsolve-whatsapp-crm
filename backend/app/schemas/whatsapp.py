from marshmallow import Schema, fields, validate, EXCLUDE

class TextBodySchema(Schema):
    body = fields.Str(required=True)
    class Meta:
        unknown = EXCLUDE

class MessageSchema(Schema):
    from_ = fields.Str(data_key="from", required=True)
    id = fields.Str(required=True)
    timestamp = fields.Str(required=True)
    type = fields.Str(required=True)
    text = fields.Nested(TextBodySchema, required=False)
    image = fields.Dict(required=False)
    video = fields.Dict(required=False)
    document = fields.Dict(required=False)
    audio = fields.Dict(required=False)
    class Meta:
        unknown = EXCLUDE

class ProfileSchema(Schema):
    name = fields.Str(required=False, allow_none=True)
    class Meta:
        unknown = EXCLUDE

class ContactSchema(Schema):
    profile = fields.Nested(ProfileSchema, required=False, allow_none=True)
    wa_id = fields.Str(required=True)
    class Meta:
        unknown = EXCLUDE

class ValueSchema(Schema):
    messaging_product = fields.Str(required=True)
    contacts = fields.List(fields.Nested(ContactSchema), required=False)
    messages = fields.List(fields.Nested(MessageSchema), required=False)
    statuses = fields.List(fields.Dict(), required=False)
    class Meta:
        unknown = EXCLUDE

class ChangeSchema(Schema):
    field = fields.Str(required=True)
    value = fields.Nested(ValueSchema, required=True)
    class Meta:
        unknown = EXCLUDE

class EntrySchema(Schema):
    id = fields.Str(required=True)
    changes = fields.List(fields.Nested(ChangeSchema), required=True)
    class Meta:
        unknown = EXCLUDE

class WebhookPayloadSchema(Schema):
    object = fields.Str(required=True, validate=validate.OneOf(["whatsapp_business_account"]))
    entry = fields.List(fields.Nested(EntrySchema), required=True)
    class Meta:
        unknown = EXCLUDE
