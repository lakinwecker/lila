package lila.ublog

import play.api.data.*
import play.api.data.Forms.*
import scalalib.model.Language

import lila.common.Form.{ cleanNonEmptyText, into, given }
import lila.core.captcha.{ CaptchaApi, WithCaptcha }
import lila.core.i18n.{ LangList, toLanguage, defaultLanguage }

final class UblogForm(val captcher: CaptchaApi, langList: LangList):

  import UblogForm.*

  private val base =
    mapping(
      "title"       -> cleanNonEmptyText(minLength = 3, maxLength = 80),
      "intro"       -> cleanNonEmptyText(minLength = 0, maxLength = 1_000),
      "markdown"    -> cleanNonEmptyText(minLength = 0, maxLength = 100_000).into[Markdown],
      "imageAlt"    -> optional(cleanNonEmptyText(minLength = 3, maxLength = 200)),
      "imageCredit" -> optional(cleanNonEmptyText(minLength = 3, maxLength = 200)),
      "language"    -> optional(langList.popularLanguagesForm.mapping),
      "topics"      -> optional(text),
      "live"        -> boolean,
      "discuss"     -> boolean,
      "sticky"      -> boolean,
      "ads"         -> boolean,
      "gameId"      -> of[GameId],
      "move"        -> text
    )(UblogPostData.apply)(unapply)

  val create = Form:
    base.verifying(lila.core.captcha.failMessage, captcher.validateSync)

  def edit(post: UblogPost) = Form(base).fill:
    UblogPostData(
      title = post.title,
      intro = post.intro,
      markdown = lila.common.MarkdownToastUi.latex.removeFrom(post.markdown),
      imageAlt = post.image.flatMap(_.alt),
      imageCredit = post.image.flatMap(_.credit),
      language = post.language.some,
      topics = post.topics.mkString(", ").some,
      live = post.live,
      discuss = ~post.discuss,
      sticky = ~post.sticky,
      ads = ~post.ads,
      gameId = GameId(""),
      move = ""
    )

object UblogForm:

  case class UblogPostData(
      title: String,
      intro: String,
      markdown: Markdown,
      imageAlt: Option[String],
      imageCredit: Option[String],
      language: Option[Language],
      topics: Option[String],
      live: Boolean,
      discuss: Boolean,
      sticky: Boolean,
      ads: Boolean,
      gameId: GameId,
      move: String
  ) extends WithCaptcha:

    def create(user: User) =
      UblogPost(
        id = UblogPost.randomId,
        blog = UblogBlog.Id.User(user.id),
        title = title,
        intro = intro,
        markdown = markdown,
        language = language.orElse(user.realLang.map(toLanguage)) | defaultLanguage,
        topics = topics.so(UblogTopic.fromStrList),
        image = none,
        live = false,
        discuss = Option(false),
        sticky = Option(false),
        ads = Option(false),
        created = UblogPost.Recorded(user.id, nowInstant),
        updated = none,
        lived = none,
        likes = UblogPost.Likes(1),
        views = UblogPost.Views(0),
        similar = none,
        rankAdjustDays = none,
        pinned = none,
        automod = none
      )

    def update(user: User, prev: UblogPost) =
      prev.copy(
        title = title,
        intro = intro,
        markdown = markdown,
        image = prev.image.map: i =>
          i.copy(alt = imageAlt, credit = imageCredit),
        language = language | prev.language,
        topics = topics.so(UblogTopic.fromStrList),
        live = live,
        discuss = Option(discuss),
        sticky = Option(sticky),
        ads = Option(ads),
        updated = UblogPost.Recorded(user.id, nowInstant).some,
        lived = prev.lived.orElse(live.option(UblogPost.Recorded(user.id, nowInstant)))
      )

  private val tierMapping =
    "tier" -> number(min = UblogRank.Tier.HIDDEN.value, max = UblogRank.Tier.BEST.value)
      .into[UblogRank.Tier]

  val tier = Form:
    single:
      tierMapping

  val adjust = Form:
    tuple(
      "pinned" -> boolean,
      tierMapping,
      "days" -> optional(number(min = -180, max = 180))
    )
