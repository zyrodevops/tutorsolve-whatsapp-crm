from marshmallow import Schema, fields, validate

class CreateUserSchema(Schema):
    full_name = fields.String(required=True, validate=validate.Length(min=2))
    email = fields.Email(required=True)
    password = fields.String(required=True, validate=validate.Length(min=6))
    role = fields.String(required=True, validate=validate.OneOf(["ADMIN", "MANAGER", "AGENT"]))
