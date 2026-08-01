from marshmallow import Schema, fields, validate

class LoginSchema(Schema):
    email = fields.Email(required=True)
    password = fields.String(required=True)
    remember_me = fields.Boolean(load_default=False)

class ForgotPasswordSchema(Schema):
    email = fields.Email(required=True)

class ResetPasswordSchema(Schema):
    token = fields.String(required=True)
    new_password = fields.String(required=True, validate=validate.Length(min=6))
